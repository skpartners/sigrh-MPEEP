import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0056_communications_publiques"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="publication",
            name="piece",
            field=models.FileField(blank=True, upload_to="communications/%Y/%m"),
        ),
        migrations.CreateModel(
            name="LecturePublication",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("lue_le", models.DateTimeField(auto_now_add=True)),
                ("lecteur", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lectures_publications", to=settings.AUTH_USER_MODEL)),
                ("publication", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lectures", to="personnel.publication")),
            ],
            options={"verbose_name": "lecture de publication"},
        ),
        migrations.AddConstraint(
            model_name="lecturepublication",
            constraint=models.UniqueConstraint(fields=("publication", "lecteur"), name="lecture_publication_unique"),
        ),
    ]
